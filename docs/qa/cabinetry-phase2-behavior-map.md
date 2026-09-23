# Cabinetry Studio Phase 2 behavior map

This map records the behavioral safety net established before the structural
refactor of `features/cabinetry/components/CabinetryStudio.tsx`. The Phase 2
change set is limited to tests, a deterministic persisted-project fixture, and
this documentation. It does not change production behavior or persisted
contracts.

## Coverage levels

- **Direct cabinetry coverage** protects Cabinetry Studio or a cabinet placed
  into the editor.
- **Shared-editor coverage** protects an applicable flow in the owning editor,
  catalog, commerce, or access-control suite. It is not duplicated in the
  Cabinetry Studio suite.
- **Known defect** characterizes current behavior but is not the desired
  contract.

## Critical user flows

| # | Flow | Applicability and current protection | Phase 2 disposition |
|---|---|---|---|
| 1 | Create or open a project | Shared-editor coverage: `tests/e2e/02-editor.spec.ts` protects new-plan replacement; `tests/e2e/03-persistence.spec.ts` protects loading a saved project. Cabinetry placement opens the current design in `tests/e2e/cabinetry-studio.spec.ts`. | Mapped; no duplicate test added. |
| 2 | Create a room or floor plan | Shared-editor coverage: `tests/e2e/18-multi-room-whole-home.spec.ts` covers blank-grid room drawing, starter templates, adding rooms, and uploads. | Mapped outside the Cabinetry Studio ownership boundary. |
| 3 | Add or modify walls, doors, and windows | Shared-editor coverage: the whole-home E2E suite covers wall drawing, wall-length edits, and opening deletion; `scripts/test-design-snapshot-v3-floor-plan-adapter.ts` protects door/window persistence adapters. | Mapped outside the Cabinetry Studio ownership boundary. |
| 4 | Place a furniture or decor object | Shared-editor coverage: `tests/e2e/17-smart-placement-smoke.spec.ts` protects add, preview, cross-room placement, confirmation, and reload. | Mapped; cabinet placement has separate direct coverage. |
| 5 | Select, move, rotate, resize, duplicate, and delete objects | Direct cabinetry coverage: the placed-cabinet workflow protects selection, nudging, quarter rotation, editing dimensions, stable identity, and reload. Shared-editor coverage in `tests/e2e/02-editor.spec.ts` and `tests/e2e/21-selected-item-actions.spec.ts` protects duplicate/delete/lock behavior. | Protected at the appropriate owning layers. |
| 6 | Use snapping and measurements | Direct cabinetry coverage: guided Fit, wall snapping, placement metadata, and unit-aware dimensions are covered by the cabinetry E2E suite; pure fit and host behavior are covered by `scripts/test-cabinetry-polygon-hosts.ts`. | Protected. |
| 7 | Switch measurement units | Direct cabinetry coverage: the Consumer workflow initializes centimetres and asserts both the displayed value and canonical millimetre model value. | Protected. |
| 8 | Undo and redo complex operations | Direct cabinetry coverage: Guided cabinet edits are undone and redone. Shared-editor coverage: one duplicate is restored by one undo and redo in `tests/e2e/02-editor.spec.ts`. | Protected. |
| 9 | Save a project | Direct cabinetry coverage: the placed-cabinet workflow waits for observable local-save status and verifies the persisted cabinet document. | Protected. |
| 10 | Reload the project | Direct cabinetry coverage: the placed-cabinet workflow reloads and verifies identity, definition, transforms, generated documentation, and checkout exclusion. | Protected. |
| 11 | Recover from an autosave or failed save | Shared-editor integration coverage: `scripts/test-design-page-save-status.ts` and `scripts/test-design-page-new-plan-controller.ts` protect save-state and failed-preservation messages. | **Resolved in Phase 3:** invalid backups now pause autosave, retain the source, quarantine a copy, expose raw export, and offer retry, last-valid, or explicit clean-start recovery. |
| 12 | Switch between 2D and 3D | Direct cabinetry coverage: `placed cabinet identity and transform stay consistent between 2D and 3D` exercises both view controls and the observable editor view state. | Added in Phase 2. |
| 13 | Preserve object positions between 2D and 3D | The same direct browser test verifies stable cabinet instance ID, position, rotation, and normalized transform across 3D -> 2D -> 3D. | Added in Phase 2. |
| 14 | Use Consumer Mode | Direct cabinetry coverage: the free-plan workflow protects Guided access, centimetre input, safe automatic sizing, estimate display, placement, and absence of Pro controls. | Protected. |
| 15 | Use Pro Mode capabilities | Direct cabinetry coverage: the Pro workflows protect Detailed mode, construction and architectural controls, placement, editing, output packages, and persisted workspace preference. | Protected. |
| 16 | Place a purchasable catalog item | Shared-editor coverage: `tests/e2e/17-smart-placement-smoke.spec.ts` protects product-to-scene placement. Cabinetry remains custom millwork and intentionally has `includeInCheckout: false`. | Mapped; cabinetry is not reclassified as a catalog product. |
| 17 | Handle a discontinued or unavailable product | Shared-editor integration coverage: `scripts/test-design-page-selected-item-panel-controller.ts` protects the unavailable-variant commerce state; catalog audits cover invalid availability mappings. | Mapped outside the Cabinetry Studio ownership boundary. |
| 18 | Enter the shopping or checkout flow | Shared-commerce coverage: `tests/e2e/05-buy.spec.ts` protects Shopify, affiliate, and imported-item buyer flows. The cabinetry fixture and placement tests assert checkout exclusion. | Protected without coupling millwork to checkout. |
| 19 | Verify project ownership or shared access | Shared-access coverage: `tests/e2e/16-share-duplicate-smoke.spec.ts` protects unauthenticated denial, authorized duplication, private design reads, valid share tokens, and missing shares. | Mapped outside the Cabinetry Studio ownership boundary. |
| 20 | Handle invalid or old project data safely | Direct cabinetry coverage: `tests/fixtures/cabinetry/legacy-design-snapshot-v3-cabinet-v1.json` is loaded through the real local-backup normalizer by `scripts/test-cabinetry-legacy-persistence.ts`; stable IDs/transforms, v1 definition compatibility, regenerated current outputs, blob-URL stripping, round trip, and checkout exclusion are asserted. Invalid JSON is asserted to throw at the parser boundary. | Old data protected; Phase 3 adds versioned document fixtures and the recovery UI from flow 11. |

## Cabinetry browser workflow inventory

`tests/e2e/cabinetry-studio.spec.ts` now contains 19 deterministic workflows:

- one critical Consumer Mode workflow;
- multiple Guided and Detailed Pro workflows;
- undo/redo and validation recovery;
- cabinet placement, transform, edit, local save, reload, and restored metadata;
- 2D/3D cabinet identity and transform consistency;
- fabrication, installer, commercial, approval, production, and handoff outputs.

The suite uses observable roles, labels, test markers, download payloads, save
status, and persisted project data. It does not use arbitrary sleeps, broad
snapshots, skipped tests, or private component-state assertions.

### Full-suite stability observation

The Phase 2 full run completed 17 of 19 workflows successfully in 39.1 minutes.
Two Pro workflows stalled on ordinary Playwright click dispatch rather than
failing a product assertion:

- the 33-template catalog loop stalled at `pet_built_in` after 4.1 minutes;
- the following core/architectural workflow stalled on its initial Studio-open
  click and reached the 600-second test timeout.

Both workflows passed unchanged when rerun independently (2.3 and 3.1 minutes,
respectively). The same `pet_built_in` interaction succeeded in the isolated
run. This is therefore baselined as cumulative browser/dev-server instability,
not a deterministic Cabinetry behavior failure. No retry, forced click,
arbitrary delay, skip, or assertion weakening was added to conceal it.

## Persistence fixture contract

The legacy fixture intentionally predates persisted preset provenance and
generated-output snapshots. It must remain loadable as a version 3 project
containing a version 1 cabinet definition. Restoration must:

1. preserve project, room, definition, module, and instance identifiers;
2. preserve canonical millimetre dimensions and plan transforms;
3. validate and regenerate current cabinet parts, BOM, cut-list, definition,
   and asset-manifest snapshots;
4. discard session-local `blob:` output URLs;
5. remain independent of catalog-product lookup; and
6. keep custom millwork outside ordinary cart checkout.

Phase 3 subsequently closed the invalid-backup defect. The pure normalization
boundary reports safe versioned diagnostics, hydration stays blocked after a
failure, and the dedicated recovery surface provides quarantine, notification,
raw-backup export, retry, last-known-valid recovery, and explicit clean start.
The canonical contract is documented in
`docs/architecture/design-document-contract.md`.
