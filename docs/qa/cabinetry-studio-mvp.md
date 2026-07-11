# Custom Millwork Studio MVP QA

## Automated Checks

- Run `npm run test:cabinetry` (domain/preset validity, numeric integrity, semantic preview, polygon/Fit hosts, wardrobe arrangements, structured room recommendations, preset provenance, the complete 33-template metadata catalog, and contextual onboarding/preferences).
- Run `npm run test:cabinetry-performance` and retain the printed large-run and 33-preset timings with the build record.
- Run `npm run test:cabinetry-accessibility` for static semantics, keyboard-control metadata, visual-choice labels, and project-unit conversion coverage. This supplements, but does not replace, the release-candidate keyboard/screen-reader smoke.
- Run `npx tsc --noEmit --incremental false --pretty false`.
- Run `npm run build`.
- Run `npx playwright test tests/e2e/cabinetry-studio.spec.ts`.

## Known MVP limitations requiring product-owner acceptance

Before freezing a release candidate, the product owner must either accept these
documented limits for the MVP or require the affected behavior to be changed:

- Fit-to-Space uses recorded door and window geometry, but the current plan does not
  capture electrical outlets or generic wall obstructions.
- Manually measured custom hosts are stored locally rather than synchronized through
  the project/server data model.
- The Studio models polygon wall geometry, but does not guess how cardinal openings map
  onto sloped walls or ambiguous interior notch edges.
- Supplier rates and internal SKU mappings are preliminary and not supplier-verified.
- Planning estimates are not checkout totals, purchase orders, or final fabricator quotes.
- Generated GLB object URLs are session-local outputs rather than durable source data;
  the editable parametric definition remains the source of truth.

## Release evidence gate

The canonical manual-gate record is
`reports/cabinetry-studio-release-evidence.v2.json`; its portable structural contract is
`reports/cabinetry-studio-release-evidence.schema.v2.json`. Keep each row at
`not_run` with `evidence: null` until the named release candidate has actually been
exercised. Do not paste results from `npm run test:cabinetry`, the static accessibility
smoke, Playwright `--list`, a fixture, or an AI-generated sample into an observed-human
record.

- Run `npm run report:cabinetry-release-evidence` to print the current 48-row matrix
  without failing solely because legitimate work remains `not_run`.
- Run `npm run check:cabinetry-release-evidence` for the release gate. It exits nonzero
  until all five A–E sessions, all 33 first-time template sessions, Consumer and Pro
  access smokes, the 18-step Guided smoke, the 41-step full manual smoke, the final UX
  release gate, the complete browser suite, real keyboard/screen-reader smoke, Consumer
  analytics, Pro analytics, and the GLB/project-export fabricator review contain valid
  passing evidence and the complete canonical payload has trusted product-owner approval.
- Run `npm run test:cabinetry-release-evidence` after changing the schema or validator.

Every executed record requires the observer, exact release-candidate commit and
environment, device/browser/viewport, start/end/elapsed timing, result, hesitations,
findings, source artifacts, and a same-observer attestation. Every artifact `path` must
be a readable local file, and its non-null SHA-256 must match the file bytes; HTTPS URLs
and issue links are not source artifacts. Issue URLs may appear only as finding references. A human
observer must sign usability, accessibility, live-analytics, and fabricator evidence.
The browser row may record automated Playwright execution, but it must contain a full
run of at least 18 current cabinetry tests with no failures/skips and a hashed local
Playwright JSON report; discovery or self-reported counts alone are rejected. Live
analytics needs a hashed normalized JSON capture whose event payloads match the emitted
snake_case contract, with QA hooks off in an environment whose name is not QA, test,
local, development, or dev.

For local production-build preflight, capture the browser source report with the JSON
reporter:

```bash
PLAYWRIGHT_JSON_OUTPUT_NAME=reports/cabinetry-playwright-release.json \
  npx playwright test tests/e2e/cabinetry-studio.spec.ts --reporter=json
shasum -a 256 reports/cabinetry-playwright-release.json
```

The formal hosted release row must target the frozen HTTPS release URL. If Vercel
Deployment Protection is enabled, load its automation-bypass secret from the approved
secure environment; never place it in the repository or command history:

```bash
export PLAYWRIGHT_RELEASE_BASE_URL=https://release-candidate.example.com
export VERCEL_AUTOMATION_BYPASS_SECRET=secure-environment-value
PLAYWRIGHT_JSON_OUTPUT_NAME=reports/cabinetry-playwright-release.json \
  npx playwright test tests/e2e/cabinetry-studio.spec.ts --reporter=json
shasum -a 256 reports/cabinetry-playwright-release.json
```

Do not credit the local preflight report to a hosted release-candidate row. Record the
exact hosted command, parsed counts, report path, hash, named release engineer, and
same-observer attestation.

The validator checks structure, exact required IDs, cross-record build consistency,
timing arithmetic, exact observed criteria, file hashes, parsed browser and analytics
records, review artifacts, and explicit attestations. `Evidence completeness` and
`Release evidence gate` are deliberately separate: complete source evidence is still
not release-ready until its entire canonical payload—including findings and waivers—is
approved with Ed25519 by the trusted product-owner key.

Provide the trusted public key only from the approved secure location; do not commit a
private key:

```bash
export CABINETRY_RELEASE_PRODUCT_OWNER_PUBLIC_KEY_PATH=/secure/keys/millwork-product-owner.pub.pem
export CABINETRY_RELEASE_PRODUCT_OWNER_KEY_ID=millwork-product-owner-2026-01
npm run check:cabinetry-release-evidence
```

The same values may be passed as `--trusted-public-key path --trusted-key-id id`. The
authorized signer must sign the UTF-8 output of
`canonicalizeCabinetryReleaseEvidenceForSignature` after populating approval metadata;
only `approval.signatureBase64` is excluded from the signed payload. Critical/high
findings must be resolved or carry product-owner waiver metadata before signing. Keep
recordings, captures, reports, and reviewed exports at every recorded local path.

Emit the exact canonical payload to a secure non-repository path before invoking the
approved Ed25519 signer. This helper never reads a private key:

```bash
npm run emit:cabinetry-release-signing-payload -- \
  reports/cabinetry-studio-release-evidence.v2.json \
  --output /secure/release/canonical-cabinetry-evidence.json
```

## Success-metric instrumentation

The design page uses the existing privacy-aware analytics client; it does not add a new
analytics dependency. Verify these events in an approved non-QA environment (QA hooks
intentionally disable capture):

- `millwork_studio_opened`: access level, create/edit mode, and entry point.
- `millwork_assembly_placed`: elapsed Studio time, module count, assembly type, Fit-to-Space
  use, and copy status.
- `millwork_assembly_updated`: elapsed reopen/edit time, module count, and assembly type.
- `millwork_studio_closed`: elapsed abandoned/cancelled session time.
- `millwork_template_selected` and `millwork_reusable_template_saved`: curated/saved-template adoption.
- `millwork_history_used`: Undo versus Redo use.
- `millwork_validation_issue_exposed`: one privacy-safe denominator event per distinct
  active issue encounter, including only its stable code, severity, target scope,
  module count, access level, and elapsed Studio time. Repeated renders are deduplicated;
  messages, field names, module/host identifiers, and entered dimensions are excluded.
- `millwork_validation_fix_applied`: recovery action and confirmation policy.
- `millwork_advanced_controls_opened`: module, fabrication, construction, or property-search entry.
- `millwork_export_completed`: successful GLB, source, schedule, drawing, DXF, RFQ, or package artifact generation.

Store the normalized capture as local JSON with
`schemaVersion: custom_millwork.analytics_capture.v1`, `capturedAt`, `buildCommit`,
`environment`, `accessLevel`, `deliveryDestination`, `qaHooksEnabled: false`, and an
`events` array of `{ name, timestamp, properties }`. Preserve the emitted snake_case
payload keys. The verifier checks each event's required payload, including
`access_level`; placement/update elapsed time, module count, assembly and Fit/copy state;
open/close mode and entry/completion state; template source; history direction;
validation issue code/severity/target scope; fix action/confirmation; advanced section;
and exported artifact.

Report Consumer and Pro funnels separately. Event delivery is supporting evidence only; it
does not replace the observed usability scenarios or the manual release signoff below.

## Consumer and Pro Access Smoke

### Consumer / Free

1. Open `/design` as a signed-out or Free user with the Custom Millwork Studio feature flag enabled.
2. Confirm `Custom Millwork Studio` is available from the normal design controls and opens in Guided setup.
3. Confirm Detailed editor, construction locks, manual bay sizing, custom shelf/door/drawer modes, clearance overlays, BOM, schedules, fabrication data, and export controls are not shown.
4. Complete Type, Space, Size, Layout, Style, and Review. Confirm the planning estimate updates from the same definition and clearly says it is not a supplier quote, checkout total, purchase order, or fabrication authorization and that final pricing can change.
5. Place the design, select it, and confirm the inspector shows a simple planning estimate with the same disclaimer plus placement, Edit, and Delete controls without fabrication-level summaries or downloads.
6. Reopen the placed design and confirm it remains in Guided setup with the same dimensions, modules, finish, hardware, position, and rotation.

### Pro

1. Open `/design?mode=designer` as a Pro user.
2. Confirm Guided setup can switch to Detailed editor and that BOM, schedules, clearances, fabrication details, and output downloads remain available.
3. Open a design first created in Consumer mode and confirm revealing Pro controls does not change its visible result or underlying definition.
4. Choose Detailed editor, close the Studio, and start another Pro creation. Confirm it enters Detailed directly; choose Guided setup and repeat to confirm the preference changes without changing the definition. Edit mode should still open Detailed for Pro, while Consumer remains Guided.

Consumer estimates use the existing preliminary quote model. They are planning allowances, not live supplier quotes, purchase orders, checkout totals, or fabrication authorizations. Custom millwork must remain excluded from normal cart and checkout flows.

## Guided Quick Start Smoke

1. Open the Studio in create mode and confirm it starts in `Guided setup` with a valid Base cabinet preview already visible.
2. Confirm Recommended templates show recognizable visual diagrams, descriptions, placement type, difficulty, estimated setup time, safety classification, and applicable room types. Confirm specialty wall-bed, under-stair, paneling, ceiling, fireplace, and trim cards do not use a generic cabinet thumbnail.
3. Search for `wardrobe`, clear the search, then filter by `Wardrobes & closets`; confirm the results update without losing the current design.
4. Select Wardrobe and move through Type, Space, Size, Layout, Style, and Review in both directions; confirm selections survive step changes.
5. In Space, confirm the Fit limitation notice says electrical outlets and generic wall obstructions are not captured, sloped or ambiguous notch openings may not map automatically, and field verification is required. Select a measured cardinal wall and exercise width-only, height-only, width-and-height, and between-boundaries fitting. Confirm recorded openings split usable segments, automatic changes are explained, and a successful fit remains valid in Review.
6. Add a manually measured niche, opening, or rectangular area. Confirm the UI says measured hosts remain on this browser/device rather than project/server synchronized, incomplete numeric drafts never enter the saved model, and a valid custom host can size the assembly without claiming an automatic plan position.
7. Set a valid overall width, height, and depth. Confirm the preview remains on the last valid value while a number field is temporarily blank, and commits only on blur or Enter.
8. Drag the constrained width, height, and depth preview handles. Confirm values snap by 10 mm, show a live lightweight preview, commit once on release, and remain editable numerically.
9. For a multi-bay template, change the overall width and confirm bay widths redistribute proportionally. Add, duplicate, delete, and reorder a bay in Automatic mode; confirm the fitted/overall target stays exact and only unlocked bays redistribute. Switch to Manual and confirm entered bay widths remain exact while the overall width is derived. Return to Automatic and confirm the UI explains that unlocked manual overrides can be replaced. Lock the overall width, an individual bay, equal sizing, shelf layout, and a material assignment; confirm automation preserves every lock or explains why fitting cannot continue.
10. Select an assembly, module, and generated part in the preview. Confirm the selection breadcrumb, module highlight, contextual specialty inspector, module issue badges, and relevant property controls update without exposing unrelated specialty controls.
11. Search properties using both friendly and professional terms such as `wall fitting panel`, `scribe`, `plinth`, `reveal`, `hinge`, and `clearance`; confirm the matched control is revealed and focused.
12. Choose a main finish, a visually illustrated door style, and a visually illustrated handle. For a wardrobe/closet bay, apply Long hanging, Double hanging, Shelves, Drawer bank, and Mixed storage cards; confirm each card produces a valid recognizable arrangement in one undoable change. Confirm the preview and Review summary update immediately and locked assignments are refused with an explanation rather than overwritten.
13. Use Undo and Redo across a template change, fit, size change, layout change, auto-fix, and finish change. Restore template defaults, then reset one selected bay.
14. Create an invalid drawer layout, open Review, click the issue, preview the suggested fix, apply it, and undo it. Confirm the issue explains what, where, why, and how to recover.
15. Switch among Issues, BOM, Materials, Hardware, Overview, and Outputs. Confirm inactive panels remain mounted for state continuity while only the selected panel is visible and Save/Place remain accessible.
16. Dismiss the first-use hint, reopen the Studio, and confirm it stays dismissed; use `Show me how` to reveal it again.
17. Place the guided result, reopen it, refit it to another wall in the same room, and update it. Confirm the asset ID remains unchanged and the position/rotation follow the explicitly selected host.
18. On a narrow viewport, confirm Guided setup exposes a collapsible 3D preview, basic semantic selection still works, and Detailed editor shows a compact preview/module selector plus a clear return to the guided workspace instead of compressing the full professional inspector.

## Required Usability Scenarios

Record observer name, build commit, viewport, elapsed time, completion result, and any hesitation for every run. Do not mark the simplicity release gate complete from automated tests alone.

### A. First-time designer — two-minute base cabinet

Create and place a 900 mm three-drawer base cabinet without external instructions. Pass when the user finds the Studio, chooses the template, changes width and finish, understands Review, and places a valid assembly in under two minutes.

### B. Intermediate designer — 3000 mm wardrobe

Use the wardrobe template to create a 3000 mm wardrobe with hanging storage, drawers, and shelves. Pass when the user adds or edits a bay, widths distribute predictably, one important bay remains locked at its chosen dimension, the preview stays valid, and the user generates the BOM.

### C. Professional designer — fitted media wall

Fit a media wall between two measured room boundaries with closed storage, open shelves, and finish panels. Pass when the user selects the host wall, uses Fit to Space, reviews appropriate fillers, edits individual modules, opens advanced controls only where required, and updates the placed result without losing its position or producing invalid dependent geometry.

### D. Error recovery

Create a drawer layout that cannot generate, confirm the invalid module is highlighted, follow the explained inline and Review issue, preview and apply a useful auto-fix, then undo it. Pass when the user recovers without resetting the assembly and can explain the difference between an error, warning, and information note.

### E. Returning designer — reopen and edit

As a returning user, reopen a placed cabinet, increase its width, and save it. Pass in under 30 seconds when the same editor opens, existing values are prefilled, the asset ID is unchanged, its position and rotation remain unchanged, and the BOM regenerates.

## Final UX Release Gate

Run this gate against the frozen release candidate with a representative participant and
an independent QA/UX observer. Use only neutral think-aloud prompts; do not coach the
participant, identify controls, translate product terminology, or let a developer guide
the run. Exercise a realistic common assembly plus the error, history, save/reload, and
placed-edit paths needed to observe every criterion below.

1. `ux_first_time_valid_assembly_quickly` — A first-time participant finds the Studio, creates a valid assembly, reviews it, and places it without coaching; record elapsed time and every hesitation.
2. `ux_defaults_usable_without_modification` — Starting from the recommended default, the participant can complete a valid common assembly without first repairing or replacing default dimensions, layout, finish, or hardware.
3. `ux_common_workflows_hide_unnecessary_construction` — A common Guided workflow can be completed without opening construction, fabrication, or other professional-detail controls that are unrelated to the task.
4. `ux_advanced_controls_available_not_intrusive` — In Pro mode, the participant can deliberately find the advanced control needed for a professional task, while those controls do not block or dominate the common path.
5. `ux_errors_actionable` — Trigger a representative invalid layout and confirm the participant can identify what is wrong and where, understand the suggested recovery, and return to a valid assembly.
6. `ux_automatic_layout_predictable` — Change overall dimensions, fit constraints, and module layout; confirm the participant can anticipate or correctly explain redistribution, preserved locks, fillers, and any refused operation.
7. `ux_undo_and_cancel_reliable` — Undo and redo representative template, size, layout, finish, and auto-fix changes, and cancel a previewed or in-progress action; confirm the visible definition returns to the expected state without corruption.
8. `ux_save_reload_preserves_visible_result` — Save and reload, then compare the visible assembly, dimensions, module order, finish, hardware, validation state, and placement transform with the pre-save result.
9. `ux_placed_edit_matches_original_interaction` — Reopen a placed assembly and confirm the same appropriate workspace, familiar controls, and prefilled values are available; update the existing asset without creating a replacement or losing its transform.
10. `ux_responsive_on_realistic_assemblies` — Use a realistic multi-module assembly and confirm preview selection, input, validation, layout, history, and review remain interactive; record any visible stall or abandoned action in the session notes.
11. `ux_common_tasks_need_no_cad_terminology` — Confirm the participant completes common sizing, layout, style, review, and placement tasks without needing unexplained CAD or fabrication terminology translated by the observer.
12. `ux_manually_tested_without_developer_guidance` — The observer attests that this was a real manual release-candidate run using only neutral prompts, with no developer guidance or instructions derived from automated/static checks.
13. `ux_critical_high_findings_disposition_reviewed` — Review every finding from the run; all critical/high findings must be resolved or have a durable issue reference and an explicit product-owner waiver before release approval.

Record the row as `observed_manual_smoke`, set
`details.manualGate.developerGuidanceUsed` to `false`, and list all 13 IDs exactly in
`details.manualGate.checksCompleted`. Capture the named observer and same-observer
attestation, release-candidate ID/commit/environment/base URL, device/browser/viewport,
start/end/elapsed timing, outcome, hesitations, and findings. Attach exactly one readable,
non-empty local screen recording and one local session notes file, and record a matching
SHA-256 for each. Automated, static, unit, or Playwright output cannot replace these
artifacts. Mark the gate `fail` if any criterion is not observed; after a code change,
freeze a new release candidate and rerun the whole gate before product-owner signoff.

## Manual Smoke

1. Open `/design?mode=designer` as a Pro user with `NEXT_PUBLIC_FEATURE_CUSTOM_MILLWORK_STUDIO` enabled, or in local development.
2. Confirm the `Custom Millwork Studio` button is visible near Grid and Snap controls.
3. Open the Studio and switch between Base, Wall, Tall, Wardrobe, Vanity, TV Console, Cabinet Run, Closet System, Media Wall, Mudroom Storage, Laundry Room, Home Office, Library Wall, Window Seat, Banquette, Murphy Bed, Fold-down Desk, Platform Storage Bed, Under-stair Storage, Room Divider Storage, Home Bar, Kitchen Island, Pantry System, Wine Storage, Pet Built-in, Kids Storage, Hobby Storage, Wall Paneling, Slat Wall, Ceiling Beams, Coffered Ceiling, Fireplace Surround, and Trim Package built-in types.
4. Change module type, component type, shelf count, vertical divider count, hanging rod count/height/spacing, pull-out hamper basket count/depth/height/slide clearance, slat count/width/depth/spacing, wall-panel columns/rows/frame width/frame depth, ceiling beam count/width/depth/orientation, coffer grid columns/rows, trim member count/profile/orientation/placement/setout height/end treatments/return depth/miter angle/reveal strip height/depth/top inset, fireplace opening/leg/header/mantel dimensions, wall-bed/fold-down panel thickness/height/open depth/hinge height/support-leg details, platform deck thickness/front overhang/back overhang/support rib count/rib width/rib height, under-stair scribe step count/high height/low height/depth/direction, room-divider finished back/rear panel count/rear panel thickness/stabilizer foot count/foot width/foot height/foot depth, mudroom hook count/hook rail height/hook projection/shoe cubby count/shoe cubby height/shoe cubby depth/shoe cubby divider thickness, sink cutout width/depth/X offset/front setout/plumbing chase width/height/depth, laundry appliance kind/count/width/height/depth/side clearance/top clearance/back clearance/utility chase height/utility chase depth, office work-surface thickness/depth/front overhang/cable grommet count/diameter/back offset/desk power chase height/depth, media TV opening/mount/blocking/cable chase/vent-slot controls, library ladder rail height/diameter/projection/standoff controls, integrated lighting channel count/depth/height/front inset, island seating overhang depth/support panel count/support panel thickness/support panel depth/end inset, pantry pull-out tray count/depth/front height/slide clearance, lifestyle insert kind/count/depth/deck height/lip height, wine rack columns/rows/depth/divider thickness, stemware rack lane count/depth/rail width/lane spacing/mount height, seat deck thickness/cushion thickness/cushion depth/front overhang/back height/back thickness, hinge side, width, toe-kick height/setback/depth, leveling foot count/height/diameter/side inset/front-back inset, face-frame stile width/rail height/depth/material, left/right filler widths and scribe allowances, finished end panel enablement and thickness, countertop/worktop thickness, countertop overhangs, countertop material, backsplash/upstand height/thickness/material, front material, and hardware; confirm validation, assembly profile, preliminary quote, supplier readiness, fabrication release readiness, BOM, dimension schedule, drawing views, material schedule, hardware schedule, edge-banding schedule, cut list, installer notes, release checklist, and preview update without runtime errors.
   Confirm adjustable shelf-pin row pair count, hole count, hole spacing, front inset, and start-height controls update the preview, validation, BOM, hardware schedule, dimension schedule, drawing notes, source definition, and shop drawing markers.
   Confirm concealed door hinge enablement, hinge pairs per door, and top/bottom inset controls update the preview, validation, BOM, hardware schedule, dimension schedule, drawing notes, source definition, and shop drawing markers.
   Confirm drawer slide enablement, slide length, and side-clearance controls update the preview, validation, BOM, hardware schedule, dimension schedule, drawing notes, source definition, and shop drawing markers.
   Confirm trim placement, setout height, end treatment, return depth, and miter angle controls update the preview, validation, BOM, cut list, dimension schedule, drawing notes, source definition, and front/plan shop drawing markers.
5. Add, duplicate, move left/right, and delete modules; confirm module order, source-definition module order, BOM, cut list, dimensions, preview, and total width update without losing stable module IDs.
6. Confirm impossible geometry creates validation errors that block export/place, while unusual but possible assembly-profile conditions such as wide shelf spans, ceiling-mounted toe kicks, thin convertible hardware panels, or shallow freestanding dividers create warnings only.
7. Download the source-definition JSON and confirm it includes `custom_millwork.source_definition.v1`, `sourceType: cabinet_definition`, the editable `CabinetDefinition`, the `custom_millwork.definition.v1` wrapper, the `custom_millwork.assembly_profile.v1` metadata, and a stable `sourceDefinitionFingerprint`.
8. Switch to another preset, import the downloaded source-definition JSON, and confirm the imported definition is editable, validates, and regenerates BOM/cut-list/drawing schedules.
9. Download the documentation CSV and confirm it includes assembly profile, preliminary quote, dimension schedule, drawing views for elevations/sections/plan footprint, BOM, material schedule, hardware schedule, edge-banding schedule, supplier readiness, fabrication release readiness, supplier SKU mappings, cut list, installer notes, and release checklist sections.
10. Download the shop drawing SVG and confirm it includes front elevation, typical side section, plan footprint, dimensions, module labels, and title block.
11. Download the fabrication DXF and confirm it contains millimeter drawing units, CUT/LABEL/META layers, source part IDs, and one rectangular cut outline per generated cut-list part.
12. Download the RFQ JSON and confirm it includes `custom_millwork.rfq.v1`, readiness status, mapped material/hardware SKU rows, custom quote rows for fabrication and installation services, requested deliverables, release checklist counts, source-definition artifact reference, edge-banding schedule, cut list, shop drawing SVG, assembly profile metadata through the millwork definition, and quote summary.
13. Download the package JSON and confirm it includes `custom_millwork.package.v1`, `sourceType: cabinet_definition`, the editable `CabinetDefinition`, the `custom_millwork.definition.v1` wrapper, `custom_millwork.assembly_profile.v1` metadata, matching `sourceDefinitionFingerprint`, BOM, drawing view schedule, supplier readiness, fabrication release readiness, supplier SKU mappings, edge-banding schedule, documentation schedules, release checklist, quote summary, and embedded RFQ request.
14. Download GLB and confirm the file is non-empty and opens as a binary glTF asset.
15. Place the cabinet in the plan; confirm it appears in 2D and 3D and is selected.
16. In the selected millwork inspector, confirm the design-to-build summary shows a planning estimate with the non-order/non-fabrication disclaimer, RFQ status, fabrication release status, cut-list count, edge-banding total, release gates, assembly profile type/complexity, material schedule rows, and hardware rows, and confirm the project readiness panel shows handoff, scope, quote, purchase, fabrication, field verification, installation, approval, and issue flags.
17. Download the placed package JSON and confirm it includes `custom_millwork.placed_asset_package.v1`, `custom_millwork.asset_manifest.v1`, placed instance ID, room ID, transform, GLB reference if present, editable source definition, assembly profile metadata, matching `sourceDefinitionFingerprint`, BOM, edge-banding schedule, documentation snapshots, supplier readiness, fabrication release readiness, embedded RFQ data, and embedded installer work order data.
18. Download the installer work order JSON and confirm it includes `custom_millwork.installer_work_order.v1`, placed instance ID, room name, room ID, position/rotation/scale transform, source dimensions, install scope, release status, installer notes, release checklist, and artifact references.
19. Download the project field verification JSON and confirm it includes `custom_millwork.project_field_verification.v1`, verification status, `canReleaseWithoutFieldVerification: false`, embedded release and installation-plan context, room summaries, placed asset transforms, measurement/placement/access checks, installer work order references, artifact references, and human-verification policy.
20. Download the project finish schedule JSON and confirm it includes `custom_millwork.project_finish_schedule.v1`, embedded schedule/procurement context, aggregated material rows, hardware rows, edge-banding rows, asset and room references, supplier mapping status, review policy flags, artifact references, and client/designer/supplier confirmation requirements.
21. Download the project millwork schedule JSON and CSV; confirm JSON includes `custom_millwork.project_schedule.v1`, room summaries, placed asset summaries, source definition fingerprints, project totals, asset manifests, editable source definitions, edge-banding totals, release blockers, and preliminary quote totals across rooms, and CSV includes Project Totals, Rooms, and Placed Millwork Assets sections.
22. Download the project scope JSON and confirm it includes `custom_millwork.project_scope.v1`, embedded project schedule, family summaries, assembly summaries, source definition fingerprints, MVP/phase coverage status, `sourceOfTruth: cabinet_definition`, scope assumptions, and artifact references for the schedule, handoff package, and placed packages.
23. Download the project procurement JSON and confirm it includes `custom_millwork.project_procurement.v1`, embedded project schedule, project finish schedule artifact, aggregated mapped material/hardware SKU rows, fabrication/installation custom quote rows, asset and room references, preliminary procurement totals, artifact references, and `includeInCheckout: false`.
24. Use Download Planning Estimate to export the project quote JSON and confirm it includes `custom_millwork.project_quote.v1`, quote status, embedded schedule/procurement/release/approval context, project finish schedule artifact, preliminary category totals, room totals, placed asset totals, supplier/custom quote readiness counts, quote artifacts, assumptions, and the supplier-quote/checkout/purchase-order/fabrication-authorization disclaimer.
25. Download the project purchase readiness JSON and confirm it includes `custom_millwork.project_purchase_readiness.v1`, purchase readiness status, `canCreateCheckout: false`, `canIssuePurchaseOrder`, embedded procurement/quote/approval/release context, project finish schedule artifact, mapped SKU candidate rows, custom quote rows, next actions, artifact references, and checkout exclusion policy.
26. Download the project fabrication release JSON and confirm it includes `custom_millwork.project_fabrication_release.v1`, release status, `canReleaseToFabrication`, `canIssuePurchaseOrder`, embedded schedule/procurement/RFQ packages, project finish schedule artifact, project cut-list artifact, per-asset release summaries, cut-list and edge-banding totals, shop drawing/DXF/package/installer artifacts, next actions, and human-approval notes.
27. Download the project approval package JSON and confirm it includes `custom_millwork.project_approval_package.v1`, approval status, client/fabricator submittal flags, release-after-signoff flag, embedded release/procurement context, project finish schedule artifact, approval items by owner/phase/due-before, signoff policy, and approval artifacts.
28. Download the project revision package JSON and confirm it includes `custom_millwork.project_revision_package.v1`, current schedule context, baseline comparison policy, asset revision snapshots with source definition fingerprints, artifact references, and a current-baseline state when no previous design baseline is supplied.
29. Download the project drawing set JSON and confirm it includes `custom_millwork.project_drawing_set.v1`, embedded schedule/revision/approval context, placed asset drawing summaries, sheet index rows, front elevation/side section/plan footprint counts, shop drawing SVG artifact references, project cut-list artifact, and drawing review policy.
30. Download the project cut-list JSON and confirm it includes `custom_millwork.project_cut_list.v1`, embedded project schedule, embedded drawing set package, embedded revision package, per-asset cut-list summaries, every generated fabrication part row, material summaries, edge-banding totals, shop drawing and DXF references, cut-list review policy, project CNC batch artifact, and non-durable DXF artifacts.
31. Download the project CNC batch JSON and confirm it includes `custom_millwork.project_cnc_batch.v1`, CNC readiness, embedded fabrication release package, project finish schedule artifact, project revision package artifact, project drawing set artifact, project cut-list artifact, aggregated cut-list counts, material summaries, edge-banding totals, generated DXF references, machining review flags, review checklist, and non-durable DXF artifacts.
32. Download the project installation plan JSON and confirm it includes `custom_millwork.project_installation_plan.v1`, installation readiness, embedded schedule and fabrication release package, project finish schedule artifact, project revision package artifact, project drawing set artifact, room install sequencing, placed asset sequencing, transforms, installer work order references, install gate counts, anchoring/service coordination counts, estimated install hours, and sequencing notes.
33. Download the project RFQ JSON and confirm it includes `custom_millwork.project_rfq.v1`, embedded project schedule, project totals, room and asset summaries, per-asset RFQ packages, project schedule artifacts, project procurement artifact, project finish schedule artifact, project revision package artifact, project drawing set artifact, project cut-list artifact, project quote package artifact, project purchase readiness artifact, project field verification artifact, project fabrication release artifact, project approval package artifact, project CNC batch artifact, project installation plan artifact, installer work order artifacts, requested deliverables, and project-level assumptions.
34. Download the project handoff bundle JSON and confirm it includes `custom_millwork.project_handoff_package.v1`, handoff status, client/fabricator/installer/purchase issue flags, embedded schedule/scope/finish/procurement/revision/drawing/cut-list/quote/purchase/release/install/field/CNC/approval/RFQ packages, placed asset handoff summaries with source definition fingerprints, required/recommended handoff checklist items, artifact references, and assumptions that preserve the editable parametric definition as source of truth.
35. Use the selected millwork inspector to nudge, snap to wall, rotate 90 degrees, and reset rotation; confirm the hidden QA marker position/rotation and transform metadata update together.
36. Open the selected millwork inspector, edit the cabinet assembly, change width or material, and update placement.
37. Confirm the millwork instance stays in the same room, with the same moved/snapped position and rotation.
38. Use undo/redo after placement, movement, rotation, and edit; confirm the cabinet is removed/restored correctly.
39. Switch rooms, then switch back; confirm the placed cabinet is not dropped.
40. Reload a saved design containing millwork; confirm definition, assembly type, assembly profile metadata, asset manifest/source definition version, project schedule totals, project scope coverage, finish schedule totals, revision baseline data, drawing set data, project cut-list data, project handoff data, material refs, hardware refs, preliminary quote, supplier readiness, fabrication release readiness, supplier SKU mappings, BOM, dimension schedule, drawing views, material schedule, hardware schedule, edge-banding schedule, cut list, installer notes, release checklist, installer work order data, transform, and rendered model survive, while temporary `blob:` GLB URLs are not stored as durable source data.
41. Open `/design` as a homeowner/free user; confirm the Custom Millwork Studio launcher opens the Consumer Guided experience, shows the preliminary estimate and placement actions, and does not reveal Pro-only construction, fabrication, or export controls.

## Notes

- Cabinetry is the first working generated geometry family, with semantic Custom Millwork presets for closet systems, media walls, mudrooms, laundry rooms, home offices, library walls, window seats, banquettes, Murphy beds, fold-down desks, platform storage beds, under-stair storage, room divider storage, home bars, kitchen islands, pantry systems, wine storage, pet built-ins, kids storage, hobby storage, wall paneling, slat walls, ceiling beams, coffered ceilings, fireplace surrounds, and trim packages using the same parametric pipeline.
- Generated GLB URLs are local session object URLs for this MVP.
- Saved design snapshots preserve the editable parametric source and generated metadata but omit session-only `blob:` GLB URLs; missing local GLB output should be regenerated from the stored source definition.
- Placed assets store a `custom_millwork.definition.v1` wrapper with the cabinet definition as `sourceDefinition`, plus a `custom_millwork.asset_manifest.v1` manifest that records the placed asset ID, source definition version, room/transform, and generated GLB durability.
- `CabinetDefinition` remains the durable source of truth for the current MVP; missing or stale local GLB URLs should be regenerated from it.
- The `sourceDefinitionFingerprint` is a deterministic hash of the editable parametric definition with volatile timestamps omitted; it should match across source-definition, RFQ, package, placed package, installer work order, project schedule, revision, and handoff exports for the same source content.
- The source-definition JSON is the direct parametric source handoff; it can be imported back into the Studio, and GLB, SVG, and DXF artifacts should be regenerated from it.
- Preliminary quote, supplier readiness, fabrication release readiness, supplier SKU mapping, BOM, dimension schedule, drawing view schedule, material schedule, hardware schedule, edge-banding schedule, cut list, installer note, and release checklist snapshots are generated from the parametric definition for quote/fabrication prep.
- Toe-kick setout is an editable parametric cabinet detail; configured height, front setback, and cut depth should update physical toe-kick parts, BOM rows, cut-list rows, edge-banding estimates, dimension/drawing notes, side-section shop drawing labels, installer notes, validation warnings/errors, and source-definition fields.
- Adjustable leveling feet are editable parametric installation hardware details for floor-supported cabinetry; enabled feet should generate GLB hardware markers, BOM rows, hardware schedule rows, source-definition fields, front/plan shop drawing markers, dimension/drawing notes, installer field-verification notes, blocking errors for impossible wall-only or inset geometry, and warning-only feedback for low foot counts, tall feet, or small diameters while staying out of board cut lists and DXF layouts.
- Face-frame construction is an editable parametric cabinet structure detail; enabled frames should generate physical rail and stile GLB geometry, BOM rows, cut-list/material/edge-banding rows, fabrication DXF board outlines, source-definition fields, front/plan shop drawing markers, dimension/drawing notes, installer coordination notes, blocking errors for impossible openings, and warning-only feedback for narrow rails/stiles or unusually deep frames.
- Left/right fillers, field-scribe allowances, and finished end panels are editable parametric fit details; fillers should keep installed width for the plan footprint while generated cut widths include scribe allowance, finished end panels should keep side-specific thickness in geometry and documentation, and both should generate physical parts, BOM rows, cut-list rows, edge-banding schedule inputs, GLB geometry, installer notes, validation warnings/errors, and source-definition fields rather than being treated as presentation-only notes.
- Countertops/worktops are editable parametric fit details for vanities, bars, islands, laundry, offices, and cabinet runs; enabled tops should generate physical GLB geometry, footprint dimensions, BOM rows, cut-list rows, material schedule rows, edge-banding/perimeter rows, source-definition fields, and overhang support warnings where needed.
- Backsplashes/upstands are editable parametric worktop details for vanities, bars, laundry rooms, offices, and cabinet runs; enabled splashes should require an enabled countertop/worktop, generate physical rear upstand GLB geometry, BOM rows, cut-list/material/edge-banding rows, dimension/drawing notes, installer field-verification notes, source-definition fields, front/side/plan shop drawing markers, blocking errors for impossible/missing worktop geometry, and warning-only feedback for unusually tall, thin, or thick upstands.
- Kitchen island seating-overhang details are editable parametric assembly controls; they should preserve base cabinet modules while generating a physical countertop footprint, support panel board parts, BOM rows, cut-list/material/edge-banding rows, dimension/drawing schedule notes, installer coordination notes, source-definition fields, front/plan shop drawing markers, blocking errors for countertop/support-depth mismatch, and warning-only feedback for long or hidden-support overhang conditions.
- Pantry pull-out tray details are editable parametric pantry controls; they should preserve tall pantry modules while generating physical tray decks and tray fronts, slide-pair hardware markers, BOM rows, board cut-list/material/edge-banding rows for tray boards only, hardware schedule rows for slide pairs, dimension/drawing schedule notes, installer coordination notes, source-definition fields, front/plan shop drawing markers, blocking errors for impossible tray depth/count/clearance, and warning-only feedback for shallow trays or tight slide clearances.
- Media wall service-zone details are editable parametric entertainment-wall controls; they should preserve console/tall storage modules while generating a physical TV blocking panel, translucent cable chase and vent-slot templates, BOM rows, board cut-list/material/edge-banding rows for blocking only, dimension/drawing schedule notes, installer field-verification notes, source-definition fields, front/plan shop drawing markers, blocking errors for impossible TV/chase/vent geometry, and warning-only feedback for unusual mount heights, shallow chases, or missing ventilation.
- Vanity sink cutout and plumbing chase details are editable parametric service-zone controls; they should preserve vanity modules while generating translucent preview markers, BOM coordination rows, dimension/drawing schedule notes, installer field-verification notes, source-definition fields, front/plan shop drawing markers, and warning-only feedback for drawer conflicts while staying out of board cut lists and material schedules.
- Integrated lighting channel details are editable parametric library/display controls; they should preserve cabinet and shelving modules while generating hardware GLB channel parts, BOM rows, hardware schedule rows, source-definition fields, front/plan shop drawing markers, dimension/drawing notes, installer coordination notes, blocking errors for impossible depth/inset/vertical fit, and warning-only feedback for shallow front insets, oversized channels, crowded channel counts, or lighting hidden behind solid fronts while staying out of board cut lists and DXF layouts.
- Adjustable shelf-pin row details are editable parametric shelf hardware/drilling controls; they should preserve shelving modules while generating hardware/drilling marker GLB parts, BOM rows, hardware schedule rows, source-definition fields, front/plan shop drawing markers, dimension/drawing notes, installer coordination notes, blocking errors for impossible depth/height fit, and warning-only feedback for tight or wide spacing or too few holes while staying out of board cut lists and DXF layouts.
- Laundry appliance bay details are editable parametric service-zone controls; they should preserve laundry cabinetry while generating translucent washer/dryer clearance and utility-chase markers, BOM coordination rows, dimension/drawing schedule notes, installer field-verification notes, source-definition fields, front/plan shop drawing markers, blocking errors for impossible closed-front or undersized bays, and warning-only feedback for tight service clearances while staying out of board cut lists and material schedules.
- Office workstation details are editable parametric home-office controls; they should preserve built-in storage modules while generating a physical work-surface board, translucent cable grommet and power/data chase markers, BOM rows, board cut-list/material/edge-banding rows for the work surface only, dimension/drawing schedule notes, installer coordination notes, source-definition fields, front/plan shop drawing markers, blocking errors for unsupported/depth-invalid work surfaces, and warning-only feedback for crowded grommets or ergonomic height concerns.
- Library ladder rail details are editable parametric library-wall controls; they should preserve open shelving modules while generating hardware rail segments and standoff markers, BOM rows, hardware schedule rows, dimension/drawing schedule notes, installer field-verification notes, source-definition fields, front/plan shop drawing markers, blocking errors for impossible rail height or missing standoffs, and warning-only feedback for low rails, tight projections, or crowded standoffs while staying out of board cut lists and DXF layouts.
- Vertical dividers are editable parametric structure controls for closets, wardrobes, libraries, offices, media walls, and cabinet runs; they should generate equal-bay physical parts, BOM rows, cut-list rows, material rows, edge-banding rows, source-definition fields, and warning-only usability feedback for cramped bays.
- Installation cleats are editable parametric anchoring controls for wall-mounted and tall millwork; they should generate physical back-rail board parts, BOM rows, cut-list/material/edge-banding rows, GLB geometry, source-definition fields, front/plan shop drawing markers, dimension/drawing notes, installer field-verification notes, blocking errors for impossible top/depth fit, and warning-only feedback for thin, short, hard-to-access, or base-cabinet cleat conditions.
- Anti-tip anchor brackets are editable parametric anchoring hardware controls for tall, wardrobe, and wall assemblies; they should generate GLB hardware markers, BOM rows, hardware schedule rows, source-definition fields, front/plan shop drawing markers, dimension/drawing notes, installer field-verification notes, blocking errors for impossible height/inset/count, and warning-only feedback for low, single, tight, or base-height placement while staying out of board cut lists and DXF layouts.
- Hanging rods are editable parametric closet/wardrobe accessory controls; they should generate physical GLB hardware, BOM rows, hardware schedule rows, source-definition fields, shop drawing markers, and warning-only usability feedback for tight double-hang spacing or awkward rod heights while staying out of board cut lists.
- Concealed door hinge details are editable parametric door-hardware controls; they should preserve door fronts while generating hinge-pair hardware markers, BOM rows, hardware schedule rows, source-definition fields, front/plan shop drawing markers, dimension/drawing notes, installer coordination notes, blocking errors for impossible hinge setouts or missing door fronts, and warning-only feedback for single-hinge, wide-door, tall-door, crowded-hinge, or unusual inset conditions while staying out of board cut lists and DXF layouts.
- Drawer box details are editable parametric drawer-construction controls; they should preserve drawer fronts while generating physical drawer side, back, and bottom board parts, BOM rows, cut-list/material/edge-banding rows, source-definition fields, front/plan shop drawing markers, dimension/drawing notes, installer coordination notes, blocking errors for impossible usable box dimensions or missing drawer fronts, and warning-only feedback for thin sides, thin bottoms, tight height/back clearance, shallow boxes, or wide drawer loads.
- Drawer slide details are editable parametric drawer-hardware controls; they should preserve drawer fronts while generating soft-close slide-pair hardware markers, BOM rows, hardware schedule rows, source-definition fields, front/plan shop drawing markers, dimension/drawing notes, installer coordination notes, blocking errors for impossible slide depth or missing drawer fronts, and warning-only feedback for shallow slides or tight/wide side clearances while staying out of board cut lists and DXF layouts.
- Pull-out hamper details are editable parametric closet/wardrobe controls; they should generate hardware basket and slide-pair GLB parts, BOM rows, hardware schedule rows, source-definition fields, front/plan shop drawing markers, dimension/drawing notes, installer coordination notes, blocking errors for impossible depth/height/width/support, and warning-only feedback for narrow baskets, shallow baskets, short baskets, tight slide clearances, or open-front visibility while staying out of board cut lists and DXF layouts.
- Slats are editable parametric wall/paneling controls; slat walls should generate physical GLB strips, BOM rows, cut-list rows, material rows, edge-banding rows, shop drawing markers, source-definition fields, and warning-only usability feedback for very tight slat spacing or unusual slat proportions.
- Wall panel rails and stiles are editable parametric paneling controls; wall paneling should generate physical GLB frame strips, BOM rows, cut-list rows, material rows, edge-banding rows, shop drawing markers, source-definition fields, and warning-only proportion feedback for cramped panel openings.
- Ceiling beams and coffered ceiling grids are editable parametric ceiling woodwork controls; they should generate physical GLB beam members, BOM rows, cut-list rows, material rows, edge-banding rows, plan-view shop drawing markers, source-definition fields, and warning-only proportion feedback for dense beam spacing or cramped coffer openings.
- Trim packages and fireplace surrounds are editable parametric trim controls; they should generate physical GLB trim members, mitered return pieces, shadow reveal/backing strips, fireplace legs, headers, and mantel shelves, BOM rows, cut-list rows, material rows, edge-banding rows, front/plan shop drawing markers, source-definition fields, trim placement/setout/end-treatment/reveal-strip metadata for baseboards, crown moulding, casing, chair rails, picture rails, and generic trim, blocking errors for impossible setouts, miter angles, or reveal strip depth/profile fits, and warning-only proportion feedback for long trim stock, shallow returns, hairline or deep reveal strips, unusual trim setouts, unusual miter angles, or narrow fireplace legs.
- Murphy bed and fold-down desk panels are editable parametric convertible controls; they should generate physical GLB closed panels, deployed platforms/work surfaces, support legs, hinge rails, BOM rows, cut-list rows for board parts, source-definition fields, shop drawing deployed-clearance markers, and warning-only feedback for non-ergonomic desk heights or shallow wall-bed clearances.
- Platform storage bed decks are editable parametric support controls; they should preserve drawer storage modules while generating physical GLB deck panels, support ribs, BOM rows, cut-list rows, edge-banding rows, source-definition fields, shop drawing plan markers, and warning-only feedback for unsupported spans or unusual deck build-ups.
- Under-stair storage scribes are editable parametric stepped-rake controls; they should preserve cabinet and drawer modules while generating physical GLB stepped scribe panels, BOM rows, cut-list rows, edge-banding rows, source-definition fields, front/plan shop drawing markers, and warning-only feedback for tight step widths or large field-templated height changes.
- Room divider storage details are editable parametric freestanding controls; they should preserve open/shelved cabinet modules while generating physical GLB rear finished panels, stabilizer feet, BOM rows, cut-list rows, edge-banding rows, source-definition fields, plan shop drawing markers, and warning-only feedback for missing stabilizers or narrow rear finish panels.
- Lifestyle inserts are editable parametric organizer controls for pet beds, toy bins, hobby trays, and small-space storage; they should preserve cabinet modules while generating physical GLB insert decks and lips, BOM rows, cut-list rows, edge-banding rows, source-definition fields, front/plan shop drawing markers, and warning-only feedback for cramped access or unusual pet/bin dimensions.
- Wine rack details are editable parametric bar/wine-storage controls; they should preserve open cabinet modules while generating physical GLB divider/rail grids, BOM rows, cut-list rows, edge-banding rows, source-definition fields, front/plan shop drawing markers, and warning-only feedback for tight bottle bays or shallow rack depths.
- Stemware rack details are editable parametric home-bar controls; they should preserve bar cabinet modules while generating hardware rail GLB parts, BOM rows, hardware schedule rows, dimension/drawing notes, installer coordination notes, source-definition fields, front/plan shop drawing markers, blocking errors for impossible depth/lane width/mount height, and warning-only feedback for tight lane spacing, shallow racks, or awkward heights while staying out of board cut lists and DXF layouts.
- Window-seat and banquette seating details are editable parametric controls; they should preserve storage base modules while generating physical GLB seat decks, cushion placeholders, optional back panels, BOM rows, board cut-list rows for wood parts only, edge-banding rows, source-definition fields, front/plan shop drawing markers, and warning-only feedback for unusual finished seat heights or thin backs.
- Mudroom hook and shoe-cubby details are editable parametric entry-storage controls; they should preserve bench modules while generating hook rails, hook hardware placeholders, shoe-cubby dividers/shelves, BOM rows, hardware schedule rows, board cut-list rows for wood parts only, edge-banding rows, source-definition fields, front/plan shop drawing markers, and warning-only feedback for cramped hooks/cubbies.
- The documentation CSV is a lightweight quote/fabrication package for the current MVP.
- The shop drawing SVG is a lightweight generated visual handoff with front elevation, side section, plan footprint, dimensions, and a title block.
- The package JSON is the machine-readable design-to-build handoff and keeps the parametric definition as the source of truth.
- The placed package JSON is the house-plan handoff for a selected smart asset and includes room, transform, and generated snapshot metadata in addition to the editable source definition.
- The installer work order JSON is the placed-asset installation handoff and focuses on room, transform, field verification, release gates, installer notes, and artifact references.
- The selected millwork inspector includes a project readiness panel derived from the handoff package so designers can see quote, purchase, fabrication, field verification, installation, approval, and scope status without opening each exported JSON.
- The project field verification JSON is the whole-design site verification package and aggregates room/asset transforms, source dimensions, measurement checks, placement checks, access/anchoring/service checks, installer references, and human-verification policy before quote, purchase, fabrication, or installation release.
- The project finish schedule JSON is the whole-design finish/material/hardware handoff and aggregates material rows, hardware rows, edge-banding lengths, supplier mapping status, asset/room references, and client/designer/supplier review requirements.
- The project schedule JSON and CSV are the whole-design millwork handoffs and aggregate placed smart assets, rooms, project totals, asset manifests, quote totals, release blockers, and fabrication schedule counts across rooms.
- The project scope JSON is the whole-design coverage handoff and summarizes represented millwork families, assembly types, source definition fingerprints, MVP/phase coverage, scope assumptions, and package artifacts so broader Custom Millwork Studio progress is explicit.
- The project procurement JSON is the whole-design supplier handoff and aggregates mapped SKU rows plus fabrication/installation custom quote rows while keeping millwork out of normal checkout until quote approval and catalog purchasing are connected.
- The project quote JSON is the whole-design preliminary estimate package and aggregates category, room, and placed asset totals with schedule/procurement/release/approval context; it is distinct from checkout, RFQ, and final supplier/fabricator pricing.
- The project purchase readiness JSON is the whole-design purchase planning bridge and classifies mapped SKU rows as future checkout candidates while keeping custom quote rows, approval gates, and all custom millwork out of normal checkout until supplier/fabricator pricing is approved.
- The project fabrication release JSON is the whole-design release-control package and aggregates release status, approval gates, shop drawing/DXF references, procurement readiness, RFQ context, and next actions without automatically approving fabrication.
- The project approval package JSON is the whole-design submittal control package and aggregates client, designer, supplier, fabricator, and installer signoff gates without marking any gate approved.
- The project revision package JSON is the whole-design change-control handoff; without a previous baseline it establishes the current smart-asset revision baseline, and with one it reports added, removed, changed, unchanged, dimension, placement, material, hardware, BOM, quote, edge-banding, supplier, and release deltas.
- The project drawing set JSON is the whole-design shop drawing/submittal index and aggregates generated shop drawing SVG references, elevation/section/plan sheet rows, dimension rows, drawing review status, and approval/revision/release context across rooms.
- The project cut-list JSON is the whole-design fabrication part-list handoff and aggregates every generated cut-list row, material summaries, edge-banding totals, shop drawing references, DXF references, and review policy before CNC or production release.
- The project CNC batch JSON is the whole-design CNC/fabrication manifest and aggregates generated DXF references, cut-list counts, material sheets, edge banding, and machining review requirements before fabricator nesting/toolpath approval.
- The project installation plan JSON is the whole-design installer handoff and aggregates room sequencing, placed transforms, installer work order references, install gates, anchoring/service coordination counts, and estimated installation effort.
- The project RFQ JSON is the whole-design fabricator quote request and embeds the project schedule plus per-asset RFQs, requested deliverables, project procurement references, project fabrication release references, project approval package references, project CNC batch references, project installation plan references, placed installer work order references, artifact references, and assumptions.
- The project handoff bundle JSON is the whole-design umbrella handoff manifest and ties schedule, finish, procurement, revision, drawing, cut-list, quote, purchase readiness, release, installation, field verification, CNC, approval, and RFQ packages into one reviewable package with issue flags and checklist gates.
- The fabrication DXF is an early CNC handoff artifact generated from the cut list; final machining, grain direction, joinery, and fabricator-specific nesting still require review.
- Supplier readiness shows mapped material/hardware SKUs, missing SKU work, and custom quote rows needed for fabricator/installer services.
- Fabrication release readiness separates RFQ readiness from final release gates such as field verification, client approval, shop drawing review, cut-list/DXF review, quote approval, and install coordination.
- The RFQ JSON is an early supplier/fabricator request package with SKU mapping readiness, service quote rows, requested deliverables, and artifact references.
- The release checklist is a generated pre-release workflow covering field verification, client approval, supplier SKU confirmation, shop drawing review, cut-list/DXF review, final quote approval, and installation coordination.
- Planning-estimate totals use placeholder rates until supplier SKU mapping and fabricator quoting are connected.
- Custom millwork assets are smart design assets and should not appear in cart or checkout summaries.
