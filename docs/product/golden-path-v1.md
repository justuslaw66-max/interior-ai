# Launch golden path v1

Status: Phase 12 acceptance contract
Applies to: Consumer Mode on the RC5 source baseline and subsequent Phase 13 candidates
Primary scenario: a first-time homeowner furnishes one measured room with at
least three real products, saves it, shares it, and reviews purchase options

## How to use this contract

Every step below is required for the launch path. “Existing telemetry” names an
event already emitted by the source baseline. “Required telemetry” is a Phase
13 obligation where the present event set cannot measure the outcome. Events
must remain privacy-safe: no raw room document, free text, address, token,
credential, precise user-entered dimensions, or private share URL.

Unless a step specifies a tighter target, the Phase 8 reference-harness
regression ceilings apply: editor interactive within 6 seconds, view switch
within 3 seconds, local autosave within 2.5 seconds, frame p95 below 250 ms,
project heap below 150 MB, and retained heap after close below 2 MB. These are
test ceilings on the reference harness, not promises for all devices.

All interactive steps must have a visible keyboard focus indicator, a
programmatic name, a non-color-only state, and no keyboard trap. Status and
error messages must be announced without stealing focus. Dialogs must contain
focus, support Escape where safe, and return focus to their invoker. Touch
targets must meet the editor's 44-pixel action-target policy.

## 1. Start project

- **User goal:** Enter a useful room-design flow without having to understand
  the full editor.
- **Normal flow:** Open `/design`; choose `Choose template` or `Draw room` from
  the fast-start region. Floor-plan upload and AI proposal remain optional.
- **Loading state:** Show a named editor-loading status and keep the chosen
  start path visible or remembered; do not display a blank canvas as ready.
- **Empty state:** Show the four start choices, with template and measured draw
  presented as the core launch paths.
- **Error state:** Explain that the editor or selected start path could not be
  prepared, offer retry, and retain any safe local draft.
- **Accessibility:** The fast-start region and every path have a heading,
  description, keyboard activation, and deterministic initial focus.
- **Performance:** The editor becomes interactive within the 6-second reference
  ceiling; the first actionable path is not delayed by Pro-only code.
- **Telemetry:** Existing `landing_viewed`, `editor_opened`, `design_started`,
  and `first_run_activation_step_completed`; required `launch_path_selected`
  with only `template`, `draw`, `upload`, or `ai`.
- **Tests:** `00-runtime-smoke.spec.ts`; public-beta start scenarios in
  `18-multi-room-whole-home.spec.ts`; capability/lazy-boundary checks.
- **Acceptance:** From initial load, a keyboard-only user can select template or
  draw, reach the chosen workspace in at most two decisions, and never see a
  false success after an initialization failure.

## 2. Create or select room

- **User goal:** Begin with one room whose shape is understandable.
- **Normal flow:** Select a furnished or unfurnished template, draw a rectangle
  on the blank 2D grid, or select an existing room from the plan.
- **Loading state:** A template application shows progress and disables only
  conflicting plan actions; existing room content remains visible.
- **Empty state:** A blank plan explains how to draw a rectangle and provides a
  template alternative.
- **Error state:** Invalid or incomplete geometry is not committed; retain the
  last valid plan and identify the segment or action that needs attention.
- **Accessibility:** Room choices expose selected state; drawing has keyboard
  or numeric alternatives; room names are announced rather than color-coded.
- **Performance:** Selection feedback is immediate; applying a launch template
  must not exceed the 6-second interactive ceiling.
- **Telemetry:** Existing `editor_room_added`, `editor_room_switched`,
  `floor_plan_room_drawn`, and `floor_plan_template_applied`.
- **Tests:** Blank-grid draw, rectangle replacement, starter-template, room
  selection, and mobile plan scenarios in `18-multi-room-whole-home.spec.ts`.
- **Acceptance:** A room exists with a stable ID, positive valid geometry, an
  explicit selected state, and no loss of a pre-existing plan without a
  confirmation.

## 3. Set dimensions and units

- **User goal:** Represent the real room at a useful scale in familiar units.
- **Normal flow:** Select the room, choose display units, and edit width/depth
  through the unit-aware inspector. Canonical persisted geometry remains in
  metres and product dimensions remain in millimetres.
- **Loading state:** Unit conversion is local and must not show a blocking
  loader; values may display a brief calculating status after a plan import.
- **Empty state:** Missing measurements show examples and supported units, not
  a fabricated default described as measured.
- **Error state:** Blank, non-finite, zero, negative, or out-of-limit drafts do
  not replace the last valid geometry; show a field-linked correction.
- **Accessibility:** Fields have unit-inclusive labels, instructions, error
  association, keyboard increments, and non-color invalid state.
- **Performance:** Valid numeric edits update feedback in the next interaction
  frame and commit as one history command.
- **Telemetry:** Existing `editor_room_dimension_edited` and
  `editor_room_resized`; required `display_unit_changed` without dimension
  values.
- **Tests:** Selected-room desktop/mobile dimension scenarios and straight-wall
  numeric editing in `18-multi-room-whole-home.spec.ts`; persistence tests.
- **Acceptance:** Entering a known width and depth round-trips through save and
  reload within documented tolerances and produces one undoable command.

## 4. Add openings

- **User goal:** Include supported doors and windows that affect usable wall
  space and layout confidence.
- **Normal flow:** Select a wall, choose door or window, place it, adjust
  supported values, and remove it if needed.
- **Loading state:** Imported-plan analysis may show progress, while manual
  opening placement remains unavailable until the wall geometry is ready.
- **Empty state:** Explain that openings attach to walls and offer the supported
  manual placement action.
- **Error state:** Reject an opening that is outside or incompatible with its
  wall; keep the prior valid plan and identify the affected opening.
- **Accessibility:** Opening type, host wall, selected state, dimensions, and
  delete action are named; a non-pointer edit/delete path exists.
- **Performance:** Placement preview and selection remain interactive within
  the frame ceiling; commit creates one history entry.
- **Telemetry:** Existing `floor_plan_opening_placed`,
  `floor_plan_opening_traced`, and `floor_plan_suggested_doorway_added`.
- **Tests:** Opening placement and delete controls in
  `18-multi-room-whole-home.spec.ts`; floor-plan tracing and persistence gates.
- **Acceptance:** A supported door or window retains its stable host reference
  after undo/redo and save/reopen and is consistent in 2D and 3D.

## 5. Search product catalog

- **User goal:** Find a real, correctly identified product appropriate for the
  room.
- **Normal flow:** Open Furnish, search or filter, inspect a product drawer,
  select an available variant, and optionally compare up to three products.
- **Loading state:** Show catalog progress or skeletons with the search control
  stable; do not show “no results” while a request is pending.
- **Empty state:** Distinguish no catalog, no search matches, no fit matches,
  and no recent/favorite products; provide clear reset actions.
- **Error state:** Explain catalog failure and retry without clearing the room
  or the current query. A stale placed-product visual must not be presented as
  current commerce.
- **Accessibility:** Search is labelled; filters and variants expose selected
  state; result count and empty changes are announced; compare remains usable
  on mobile and keyboard.
- **Performance:** Search/filter feedback appears within 500 ms for locally
  available data; remote waits show loading immediately.
- **Telemetry:** Existing `catalog_initialized`,
  `catalog_main_group_select`, `catalog_smart_filter_toggle`, compare events,
  and privacy-safe `catalog_variant_resolution_issue`.
- **Tests:** `06-catalog-compare.spec.ts`, `12-variant-identity.spec.ts`, mobile
  Furnish and shop-panel scenarios in `18-multi-room-whole-home.spec.ts`.
- **Acceptance:** A user can find, inspect, and select a product/variant whose
  name, dimensions, imagery, variant identity, and current purchase
  classification remain aligned.

## 6. Place product

- **User goal:** Add real products to the intended room and build a useful
  layout.
- **Normal flow:** Choose `Add to room`, preview placement, commit it in the
  active room, and repeat until at least three products are present.
- **Loading state:** Product model loading shows a stable placeholder tied to
  the selected product; placement cannot silently switch products.
- **Empty state:** The room explains how to open the catalog and add the first
  item; onboarding may suggest but must not require automatic placement.
- **Error state:** Collision, missing dimensions, invalid variant, or asset
  failure produces an actionable message; no ghost item or false cart entry is
  created.
- **Accessibility:** Add and placement controls are named; the placed item,
  room, count, and selection are announced; a non-drag placement path exists.
- **Performance:** Commit and selection feedback are immediate; asset loading
  cannot block editing existing objects.
- **Telemetry:** Existing `first_item_added`, `third_item_added`,
  `first_valid_layout`, and `catalog_compare_add_to_room`.
- **Tests:** `01-onboarding.spec.ts`, furnished-template and cross-room preview
  placement scenarios, and catalog/variant tests.
- **Acceptance:** Three products have unique stable instance IDs, correct
  product/variant snapshots, valid room membership, and one history entry per
  committed placement.

## 7. Transform product

- **User goal:** Move, rotate, resize where supported, duplicate, and delete an
  object without corrupting the room.
- **Normal flow:** Select an item; use visible inspector/toolbar controls or
  supported direct manipulation; confirm constrained or rejected operations.
- **Loading state:** Transforming an already loaded object never displays a
  page loader; a replacement model may load without changing committed
  identity or transform.
- **Empty state:** With no item selected, explain selection rather than showing
  disabled unexplained controls.
- **Error state:** Collision or invalid size rejects the command, restores the
  last valid state, and announces why.
- **Accessibility:** Every transform has a labelled keyboard/numeric action;
  exact-angle input suppresses conflicting shortcuts; destructive actions are
  unambiguous.
- **Performance:** Pointer feedback remains within frame budgets; one gesture
  commits one command rather than one command per pointer event.
- **Telemetry:** Existing `editor_item_rotated`; required privacy-safe
  `editor_item_transform_committed` with action (`move`, `rotate`, `resize`,
  `duplicate`, `delete`), source, result, and snap flag but no coordinates.
- **Tests:** Collision, wall snap, duplicate undo/redo in `02-editor.spec.ts`;
  `11-rotation-shortcuts.spec.ts`; `21-selected-item-actions.spec.ts`;
  cabinetry transform/persistence scenarios.
- **Acceptance:** Each supported action succeeds once or fails closed; undo and
  redo restore the same stable item identity and exact prior/next transform.

## 8. Use snapping

- **User goal:** Align objects confidently while understanding what changed.
- **Normal flow:** Move or rotate with snapping enabled; see guide, target, and
  snapped result; use explicit wall snap where offered.
- **Loading state:** None for local snapping; unavailable target geometry shows
  a disabled action with explanation.
- **Empty state:** With no selected object or nearby target, explain the
  prerequisite and do not imply a snap occurred.
- **Error state:** An invalid/colliding snapped result is rejected with the last
  valid transform preserved.
- **Accessibility:** Snap on/off and target are conveyed by text/ARIA and not
  color alone; keyboard rotation uses the documented increment.
- **Performance:** Guides track within the frame ceiling and disappear after
  commit/cancel; snapping cannot create a render loop.
- **Telemetry:** Existing rotation events include `snapped`; required
  `editor_snap_committed` for wall/guide snaps with target type and result only.
- **Tests:** Wall-snap stability in `02-editor.spec.ts`; snap presets in
  `11-rotation-shortcuts.spec.ts`; cabinetry Fit/lock tests.
- **Acceptance:** The preview and committed result agree, one history command
  is created, and the user can explain whether snapping was applied.

## 9. Undo and redo

- **User goal:** Safely explore and recover from a recent room or object change.
- **Normal flow:** Use named toolbar buttons or standard keyboard shortcuts;
  redo remains available until a new branch command is committed.
- **Loading state:** Undo/redo is synchronous for editor commands; disable it
  during an incompatible pending transaction with an explanation.
- **Empty state:** Buttons are disabled and labelled when their stacks are
  empty; no error toast is shown for an unavailable action.
- **Error state:** A command failure preserves the current document and reports
  the failed action; it never clears history silently.
- **Accessibility:** Buttons expose the action name and shortcut; focus stays on
  the control; status announces the restored state.
- **Performance:** A command completes within normal interaction feedback and
  does not replay pointer-level intermediate states.
- **Telemetry:** Existing `millwork_history_used` for Cabinetry; required shared
  `editor_history_used` with direction and privacy-safe command category.
- **Tests:** Duplicate undo/redo in `02-editor.spec.ts`; editor history gates;
  reversible Cabinetry scenarios in `cabinetry-studio.spec.ts`.
- **Acceptance:** Placement, one transform, duplicate, delete, and one room
  edit each round-trip through undo/redo with stable IDs and no divergent 2D/3D
  result.

## 10. Switch 2D and 3D

- **User goal:** Validate the same room and objects in plan and spatial views.
- **Normal flow:** Use the named Plan/Room control; retain room, selection,
  camera intent where supported, and the same canonical document.
- **Loading state:** Show a named scene-loading state without replacing the
  plan or reporting the target view as ready early.
- **Empty state:** An empty room still renders its measured shell in both views
  and explains how to add products.
- **Error state:** Renderer or model failure offers retry/lite mode and retains
  editable document data; 2D remains available where possible.
- **Accessibility:** The control exposes current state with `aria-pressed` or an
  equivalent selected state; canvas-independent controls remain keyboard
  reachable.
- **Performance:** Switch completes within 3 seconds on the reference harness;
  Consumer mode does not load Pro-only implementation chunks.
- **Telemetry:** Required `editor_view_changed` with source/target, elapsed
  bucket, lite-mode state, and result.
- **Tests:** 2D projection and view toggles in
  `18-multi-room-whole-home.spec.ts`; stable cabinet identity/transform in
  `cabinetry-studio.spec.ts`; Phase 8 browser benchmark.
- **Acceptance:** Room IDs, item IDs, transforms, variant identity, and opening
  references are unchanged by a 3D→2D→3D round trip.

## 11. Autosave

- **User goal:** Know that work is locally protected and, when authenticated,
  synchronized to the correct cloud project.
- **Normal flow:** Valid commands update the last-known-valid local backup;
  cloud writes debounce and serialize; the UI distinguishes saving, saved,
  local-only, pending, conflict, and failed.
- **Loading state:** Show saving/pending without blocking further safe edits.
- **Empty state:** A new anonymous design explains local protection and when
  sign-in is needed for cloud persistence.
- **Error state:** Storage, validation, network, authorization, and HTTP 409
  conflict remain visible and retryable; no failure is labelled saved.
- **Accessibility:** Save status is an announced status region with restrained
  repetition; retry and conflict actions are keyboard accessible.
- **Performance:** Local autosave stays within 2.5 seconds on the reference
  harness; cloud latency is reported separately and never hidden.
- **Telemetry:** Existing `design_saved_db`; required privacy-safe
  `design_save_state_changed` for source, result, conflict, and latency bucket.
- **Tests:** Save success/failure/retry and room isolation in
  `03-persistence.spec.ts`; persistence contract and Phase 8 benchmarks;
  authenticated Phase 11 HTTPS path.
- **Acceptance:** A valid edit reaches last-known-valid storage and, for an
  authenticated owner, cloud saved state; forced failures remain visible and
  recover through retry without duplicate objects.

## 12. Close and reopen

- **User goal:** Return later to the same visible design.
- **Normal flow:** Close or navigate away after saved status, open the design
  from the user's list, migrate/validate it, and restore active room, items,
  zones, views, variants, and transforms.
- **Loading state:** Show project loading and migration status; do not mount a
  misleading starter design before the saved document is resolved.
- **Empty state:** A user with no cloud designs sees a create action; a design
  with an empty room remains a valid project, not “missing.”
- **Error state:** Not found, unauthorized, unsupported future version,
  migration failure, and network failure have distinct safe messages and do
  not overwrite local recovery data.
- **Accessibility:** Project choices, loading state, migration errors, and
  recovery actions are named and focus-managed.
- **Performance:** A representative consumer design becomes interactive within
  the 6-second reference ceiling after its document is available.
- **Telemetry:** Required `design_reopen_completed` with document version,
  migration-needed flag, result, and elapsed bucket; never include content.
- **Tests:** Cloud reload and room switching in `03-persistence.spec.ts`;
  v1/v2/v3 migration fixtures; authenticated Phase 11 save/reopen test.
- **Acceptance:** Fingerprint-relevant content and every stable room/item ID
  match the last successful save; derived output may regenerate without
  changing document meaning.

## 13. Recover from failure

- **User goal:** Escape an invalid or interrupted local backup without losing
  the only available evidence.
- **Normal flow:** Detect invalid active backup, preserve it, copy it to a
  quarantine key where possible, block hydration/autosave, and offer download,
  retry, last-known-valid, or explicit clean start.
- **Loading state:** Validation/migration shows a recovery status and prevents
  the editor from writing a replacement.
- **Empty state:** If no last-known-valid copy exists, say so and retain the raw
  download/clean-start options.
- **Error state:** Quarantine or download failure is reported independently;
  clean start removes only the active source after explicit confirmation.
- **Accessibility:** Diagnostics summarize what happened in plain language;
  recovery actions are ordered, named, focusable, and announced.
- **Performance:** Validation does not freeze the shell; large allowed
  documents stay within persistence size/performance limits.
- **Telemetry:** Required `design_recovery_action` with error code, available
  options, chosen action, and result; never include raw backup or paths.
- **Tests:** Both scenarios in `design-local-backup-recovery.spec.ts` and the
  design-persistence verification command.
- **Acceptance:** An invalid source is never overwritten automatically; opening
  last-known-valid yields a valid document; clean start cannot delete
  quarantine or last-known-valid data.

## 14. Share

- **User goal:** Send a durable, read-only design view to another person.
- **Normal flow:** An authenticated owner creates/copies a share link; the
  recipient opens the read-only view, changes rooms/presentation views, and may
  duplicate into their own account if allowed.
- **Loading state:** Link creation and shared-document loading show progress;
  the copy action is disabled while a token is pending.
- **Empty state:** A design with no saved views still opens its active room;
  absence of products is explained without exposing editor controls.
- **Error state:** Unauthorized owner, invalid/revoked token, missing design,
  copy failure, and network failure are distinct and never expose private data.
- **Accessibility:** Copy feedback is announced; the share viewer has named
  room/view controls; read-only status is explicit; no mutation shortcuts work.
- **Performance:** The shared representative consumer design becomes usable
  within the 6-second reference ceiling after document response.
- **Telemetry:** Existing `share_link_created`, `share_link_copied`,
  `share_link_opened`, share-page copy/native-share events, and duplicate result
  events.
- **Tests:** `04-share.spec.ts`, `16-share-duplicate-smoke.spec.ts`, and the
  authenticated Phase 11 share path.
- **Acceptance:** A non-owner with only the valid token can view the projected
  share snapshot but cannot invoke editor mutations or retrieve owner-only
  fields; the source fingerprint remains unchanged.

## 15. Open shopping list

- **User goal:** Understand what to buy, from whom, in what quantity, and which
  items need another action.
- **Normal flow:** Open Shop from the saved design/share export; consolidate
  repeated items by current product/variant/purchase option and show current
  price/availability/link where available.
- **Loading state:** Current commerce resolution shows progress separately from
  the saved visual plan.
- **Empty state:** Explain whether the room has no products, products are not
  selected for shopping, or all purchase details are unavailable; link back to
  Furnish.
- **Error state:** Catalog/commerce failure preserves the design and marks
  affected rows unavailable; it never uses saved visual metadata as current
  price or stock.
- **Accessibility:** The list/table has meaningful headers, quantities,
  availability text, and named merchant actions; status is not color-only.
- **Performance:** The list shell opens within 1 second for a representative
  consumer document; remote commerce waits show row-level loading.
- **Telemetry:** Existing `cart_opened`, cart-empty actions,
  `share_export_shopping_csv_downloaded`, and privacy-safe commerce events;
  required `shopping_summary_opened` with counts by readiness class.
- **Tests:** Variant-to-cart/compare identity in
  `12-variant-identity.spec.ts`; shared shopping/export and authenticated Phase
  11 evidence; purchase-flow specs require strengthening in Phase 13 Batch 5.
- **Acceptance:** Quantities and variant IDs match the design; each row is
  labelled `purchasable`, `affiliate`, `unavailable`, or `custom quote`; custom
  millwork has `includeInCheckout: false`.

## 16. Continue to purchase

- **User goal:** Leave the plan through an approved path for an eligible item
  without buying the wrong variant.
- **Normal flow:** Select eligible shopping rows; validate current product,
  variant, quantity, merchant mapping, ownership/session, and feature policy;
  continue to Shopify or a clearly identified affiliate merchant.
- **Loading state:** Checkout/session creation shows progress, prevents double
  submission, and retains the shopping summary.
- **Empty state:** If no items are eligible, explain each reason and provide
  catalog or quote next steps; no disabled button without explanation.
- **Error state:** Invalid variant, stale mapping, merchant failure, feature
  disabled, or authorization failure stops before external checkout and keeps
  the design unchanged.
- **Accessibility:** Merchant, destination, price qualification, external-link
  behavior, and disabled reason are announced; focus returns safely after a
  failed attempt.
- **Performance:** Local validation feedback appears within 500 ms; remote
  session creation shows loading immediately and has an explicit timeout/retry.
- **Telemetry:** Existing `shop_clicked`, `shopify_checkout_started`,
  `checkout_started`, `checkout_return_observed`, and privacy-safe
  `commerce_event`; never include tokens or full checkout URLs.
- **Tests:** Invalid variant fail-closed coverage in
  `12-variant-identity.spec.ts`; `17-retailer-links.spec.ts`; current
  `05-buy.spec.ts` is insufficient as a launch gate because several assertions
  can return early. Phase 13 Batch 5 must add a strict approved sandbox test or
  explicitly define affiliate continuation as the launch completion boundary.
- **Acceptance:** The exact selected variant and quantity reach the approved
  external path once, ineligible/custom items remain excluded, cancellation or
  failure is recoverable, and the source design is unchanged. Production
  checkout cannot be enabled from this document alone.

## End-to-end launch scenario

The Phase 13 vertical slice is accepted only when one strict test and one
authorized human session traverse all applicable steps on one immutable
candidate. The automated test may use controlled catalog/database fixtures and
an approved merchant sandbox; the human session must use neutral prompts and
record hesitations. Neither can replace the other.

The scenario passes when:

1. one measured room is created or selected;
2. a supported opening is present;
3. three correctly identified products are placed;
4. at least one move, rotation, supported resize, duplicate, delete, snap,
   undo, and redo is demonstrated;
5. the 2D and 3D fingerprints/identities remain consistent;
6. the authenticated save reaches cloud-saved state;
7. close/reopen restores stable IDs and transforms;
8. the recovery path is independently exercised without corrupting the saved
   design;
9. a read-only share opens successfully;
10. the shopping summary classifies every row; and
11. one eligible item reaches the approved purchase boundary without enabling
    custom millwork checkout.
